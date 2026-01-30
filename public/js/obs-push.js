/*
 * media-sync-api OBS helper
 * Usage: window.obsPushBrowserMedia({ assetUrl: 'http://host/media/clip.mp4?source=primary' })
 * Example: window.obsPushBrowserMedia({ assetUrl, targetSceneName: 'ASSET_MEDIA', inputName: 'ASSET_MEDIA' })
 */
(function(){
  const normalizeName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  const buildPlayerUrl = ({ assetUrl, fit, muted }) => {
    const resolvedAssetUrl = new URL(assetUrl, window.location.origin);
    const params = new URLSearchParams({
      src: resolvedAssetUrl.toString(),
      fit,
      muted: muted ? '1' : '0',
    });
    return `${resolvedAssetUrl.origin}/player.html?${params.toString()}`;
  };

  const findInputName = (inputs, desired) => {
    const name = String(desired || '').trim();
    if (!name) return null;
    const normalized = normalizeName(name);
    return inputs.find((entry) => entry.inputName === name)
      || inputs.find((entry) => normalizeName(entry.inputName) === normalized)
      || inputs.find((entry) => normalizeName(entry.inputName).startsWith(normalized))
      || inputs.find((entry) => normalized.startsWith(normalizeName(entry.inputName)))
      || null;
  };

  const buildUniqueInputName = (inputs, desired, extraNames = []) => {
    const base = String(desired || 'ASSET_MEDIA').trim() || 'ASSET_MEDIA';
    const existing = new Set([
      ...((inputs || []).map((entry) => entry.inputName)),
      ...extraNames,
    ]);
    if (!existing.has(base)) return base;
    let i = 2;
    let candidate = `${base} (${i})`;
    while (existing.has(candidate)){
      i += 1;
      candidate = `${base} (${i})`;
    }
    return candidate;
  };

  async function createBrowserInput(obs, sceneName, desiredName, inputs, settings){
    let attempts = 0;
    const sceneList = await obs.call('GetSceneList');
    const scenes = Array.isArray(sceneList?.scenes) ? sceneList.scenes : [];
    let candidate = buildUniqueInputName(inputs, desiredName, scenes.map((scene) => scene.sceneName));
    while (attempts < 5){
      try{
        await obs.call('CreateInput', {
          sceneName,
          inputName: candidate,
          inputKind: 'browser_source',
          inputSettings: settings,
          sceneItemEnabled: true,
        });
        return candidate;
      }catch(error){
        const message = String(error?.message || '').toLowerCase();
        if (!message.includes('already exists')){
          throw error;
        }
        const refreshed = await obs.call('GetInputList');
        const refreshedInputs = Array.isArray(refreshed?.inputs) ? refreshed.inputs : [];
        const refreshedScenes = await obs.call('GetSceneList');
        const refreshedSceneList = Array.isArray(refreshedScenes?.scenes) ? refreshedScenes.scenes : [];
        candidate = buildUniqueInputName(
          refreshedInputs,
          desiredName,
          refreshedSceneList.map((scene) => scene.sceneName),
        );
      }
      attempts += 1;
    }
    throw new Error('Unable to create a unique OBS Browser Source input.');
  };

  async function getSceneItemId(obs, sceneName, inputName){
    try{
      const response = await obs.call('GetSceneItemId', { sceneName, sourceName: inputName });
      if (response?.sceneItemId !== undefined) return response.sceneItemId;
    }catch(_){
      // ignore
    }
    const created = await obs.call('CreateSceneItem', { sceneName, sourceName: inputName });
    if (created?.sceneItemId === undefined) throw new Error('Failed to create scene item');
    return created.sceneItemId;
  }

  async function setSceneBounds(obs, sceneName, sceneItemId, width, height, fit){
    const boundsType = fit === 'contain' ? 'OBS_BOUNDS_SCALE_INNER' : 'OBS_BOUNDS_SCALE_OUTER';
    await obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        alignment: 0,
        boundsType,
        boundsAlignment: 0,
        boundsWidth: width,
        boundsHeight: height,
      },
    });
  }

  async function removeSharedSceneItems(obs, inputName, targetSceneName){
    const list = await obs.call('GetSceneList');
    const scenes = Array.isArray(list?.scenes) ? list.scenes : [];
    for (const scene of scenes){
      if (scene.sceneName === targetSceneName) continue;
      const items = await obs.call('GetSceneItemList', { sceneName: scene.sceneName });
      const sceneItems = Array.isArray(items?.sceneItems) ? items.sceneItems : [];
      for (const item of sceneItems){
        if (item.sourceName === inputName){
          await obs.call('RemoveSceneItem', { sceneName: scene.sceneName, sceneItemId: item.sceneItemId });
        }
      }
    }
  }

  window.obsPushBrowserMedia = async function obsPushBrowserMedia({
    obsHost = '192.168.0.187',
    obsPort = 4455,
    obsPassword = '123456',
    targetSceneName = 'ASSET_MEDIA',
    inputName = 'ASSET_MEDIA',
    assetUrl,
    width = 1080,
    height = 1920,
    fit = 'cover',
    ensureExclusiveScene = false,
    muted = false,
  }){
    if (!assetUrl) throw new Error('assetUrl is required');
    if (typeof OBSWebSocket === 'undefined') throw new Error('OBSWebSocket is not available');

    const obs = new OBSWebSocket();
    await obs.connect(`ws://${obsHost}:${obsPort}`, obsPassword);

    try{
      const inputList = await obs.call('GetInputList');
      const inputs = Array.isArray(inputList?.inputs) ? inputList.inputs : [];
      const match = findInputName(inputs, inputName);
      const resolvedInputName = match?.inputName || inputName;
      const playerUrl = buildPlayerUrl({ assetUrl, fit, muted });
      let finalInputName = resolvedInputName;

      if (!match){
        try{
          finalInputName = await createBrowserInput(
            obs,
            targetSceneName,
            finalInputName,
            inputs,
            {
              url: playerUrl,
              width,
              height,
              fps: 60,
              shutdown: false,
              restart_when_active: true,
              reroute_audio: true,
            },
          );
        }catch(error){
          const message = String(error?.message || '');
          const lowered = message.toLowerCase();
          if (lowered.includes('already exists')){
            const refreshed = await obs.call('GetInputList');
            const refreshedInputs = Array.isArray(refreshed?.inputs) ? refreshed.inputs : [];
            const refreshedMatch = findInputName(refreshedInputs, resolvedInputName);
            if (refreshedMatch){
              finalInputName = refreshedMatch.inputName;
              await obs.call('SetInputSettings', {
                inputName: finalInputName,
                inputSettings: {
                  url: playerUrl,
                  width,
                  height,
                  fps: 60,
                  shutdown: false,
                  restart_when_active: true,
                  reroute_audio: true,
                },
                overlay: false,
              });
            }else{
              finalInputName = await createBrowserInput(
                obs,
                targetSceneName,
                resolvedInputName,
                refreshedInputs,
                {
                  url: playerUrl,
                  width,
                  height,
                  fps: 60,
                  shutdown: false,
                  restart_when_active: true,
                  reroute_audio: true,
                },
              );
            }
          }else{
            throw error;
          }
        }
      }else{
        try{
          await obs.call('SetInputSettings', {
            inputName: finalInputName,
            inputSettings: {
              url: playerUrl,
              width,
              height,
              fps: 60,
              shutdown: false,
              restart_when_active: true,
              reroute_audio: true,
            },
            overlay: false,
          });
        }catch(error){
          const message = String(error?.message || '').toLowerCase();
          if (!message.includes('not an input')){
            throw error;
          }
          const refreshed = await obs.call('GetInputList');
          const refreshedInputs = Array.isArray(refreshed?.inputs) ? refreshed.inputs : [];
          finalInputName = await createBrowserInput(
            obs,
            targetSceneName,
            resolvedInputName,
            refreshedInputs,
            {
              url: playerUrl,
              width,
              height,
              fps: 60,
              shutdown: false,
              restart_when_active: true,
              reroute_audio: true,
            },
          );
        }
      }

      try{
        await obs.call('PressInputPropertiesButton', {
          inputName: finalInputName,
          propertyName: 'refreshnocache',
        });
      }catch(_){
        // ignore
      }

      const sceneItemId = await getSceneItemId(obs, targetSceneName, finalInputName);
      await setSceneBounds(obs, targetSceneName, sceneItemId, width, height, fit);

      if (ensureExclusiveScene){
        await removeSharedSceneItems(obs, finalInputName, targetSceneName);
      }
    }finally{
      await obs.disconnect();
    }
  };
})();
