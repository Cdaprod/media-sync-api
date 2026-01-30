/*
 * media-sync-api OBS helper
 * Usage: window.obsPushBrowserMedia({ assetUrl: 'http://host/media/clip.mp4?source=primary' })
 * Example: window.obsPushBrowserMedia({ assetUrl, targetSceneName: 'ASSET_MEDIA', inputName: 'ASSET_MEDIA' })
 */
(function(){
  const normalizeName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  const buildPlayerUrl = ({ assetUrl, fit, muted }) => {
    const params = new URLSearchParams({
      src: assetUrl,
      fit,
      muted: muted ? '1' : '0',
    });
    return `${window.location.origin}/player.html?${params.toString()}`;
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

      if (!match){
        try{
          await obs.call('CreateInput', {
            sceneName: targetSceneName,
            inputName: resolvedInputName,
            inputKind: 'browser_source',
            inputSettings: {
              url: playerUrl,
              width,
              height,
              fps: 60,
              shutdown: false,
              restart_when_active: true,
              reroute_audio: true,
            },
            sceneItemEnabled: true,
          });
        }catch(error){
          const message = String(error?.message || '');
          if (!message.toLowerCase().includes('already exists')){
            throw error;
          }
          await obs.call('SetInputSettings', {
            inputName: resolvedInputName,
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
        }
      }else{
        await obs.call('SetInputSettings', {
          inputName: resolvedInputName,
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
      }

      try{
        await obs.call('PressInputPropertiesButton', {
          inputName: resolvedInputName,
          propertyName: 'refreshnocache',
        });
      }catch(_){
        // ignore
      }

      const sceneItemId = await getSceneItemId(obs, targetSceneName, resolvedInputName);
      await setSceneBounds(obs, targetSceneName, sceneItemId, width, height, fit);

      if (ensureExclusiveScene){
        await removeSharedSceneItems(obs, resolvedInputName, targetSceneName);
      }
    }finally{
      await obs.disconnect();
    }
  };
})();
