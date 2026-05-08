export function getIceCandidateKey(candidate: RTCIceCandidateInit): string {
  return `${candidate.candidate || ''}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}`;
}

export function getIceCandidateType(candidateString: string | undefined | null): string | null {
  if (!candidateString) return null;
  const typMatch = candidateString.match(/\btyp\s+([a-zA-Z0-9_-]+)/);
  return typMatch?.[1] || null;
}

export async function safeAddIceCandidate(
  peer: RTCPeerConnection,
  candidate: RTCIceCandidateInit,
  debugLabel: string,
): Promise<{ ok: true } | { ok: false; errorName: string; errorMessage: string; debugLabel: string }> {
  try {
    await peer.addIceCandidate(candidate);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errorName: error instanceof DOMException ? error.name : (error instanceof Error ? error.name : 'UnknownError'),
      errorMessage: error instanceof Error ? error.message : String(error),
      debugLabel,
    };
  }
}

export async function summarizeCandidatePairFromStats(peer: RTCPeerConnection): Promise<{
  selectedCandidatePair: Record<string, unknown> | null;
  localCandidateTypes: string[];
  remoteCandidateTypes: string[];
}> {
  const localCandidates = new Map<string, any>();
  const remoteCandidates = new Map<string, any>();
  let selectedPair: any = null;
  let selectedPairId: string | null = null;
  const report = await peer.getStats();
  report.forEach((entry) => {
    const stat = entry as any;
    if (stat.type === 'local-candidate') localCandidates.set(stat.id, stat);
    if (stat.type === 'remote-candidate') remoteCandidates.set(stat.id, stat);
    if (stat.type === 'transport' && stat.selectedCandidatePairId) selectedPairId = stat.selectedCandidatePairId;
    if (stat.type === 'candidate-pair' && (stat.selected || (stat.nominated && stat.state === 'succeeded'))) selectedPair = stat;
  });
  if (selectedPairId) selectedPair = report.get(selectedPairId) || selectedPair;
  const selectedCandidatePair = selectedPair ? {
    id: selectedPair.id,
    state: selectedPair.state ?? null,
    nominated: selectedPair.nominated ?? null,
    bytesSent: selectedPair.bytesSent ?? 0,
    bytesReceived: selectedPair.bytesReceived ?? 0,
    currentRoundTripTime: selectedPair.currentRoundTripTime ?? null,
    localCandidateId: selectedPair.localCandidateId ?? null,
    remoteCandidateId: selectedPair.remoteCandidateId ?? null,
  } : null;
  const localCandidateTypes = Array.from(new Set(Array.from(localCandidates.values()).map((candidate) => candidate.candidateType || getIceCandidateType(candidate.candidate)).filter(Boolean)));
  const remoteCandidateTypes = Array.from(new Set(Array.from(remoteCandidates.values()).map((candidate) => candidate.candidateType || getIceCandidateType(candidate.candidate)).filter(Boolean)));
  return { selectedCandidatePair, localCandidateTypes, remoteCandidateTypes };
}
