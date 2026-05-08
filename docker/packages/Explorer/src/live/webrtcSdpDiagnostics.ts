export function extractMediaDirection(sdp: string, kind: 'audio' | 'video'): string | null {
  const sections = sdp.split(/\r?\nm=/);
  for (const section of sections) {
    const normalized = section.startsWith('m=') ? section : `m=${section}`;
    if (!normalized.startsWith(`m=${kind} `)) continue;
    const direction = normalized.match(/\r?\n(a=(sendrecv|sendonly|recvonly|inactive))(?:\r?\n|$)/)?.[2];
    return direction || null;
  }
  return null;
}

export function summarizePeerTransceivers(pc: RTCPeerConnection): {
  transceiverDirections: string[];
  transceiverCurrentDirections: Array<string | null>;
} {
  const transceivers = pc.getTransceivers();
  return {
    transceiverDirections: transceivers.map((transceiver) => `${transceiver.receiver.track.kind}:${transceiver.direction}`),
    transceiverCurrentDirections: transceivers.map((transceiver) => transceiver.currentDirection ? `${transceiver.receiver.track.kind}:${transceiver.currentDirection}` : null),
  };
}

export function summarizePeerSenders(pc: RTCPeerConnection): {
  senderKinds: string[];
  senderTrackIds: Array<string | null>;
} {
  const senders = pc.getSenders();
  return {
    senderKinds: senders.map((sender) => sender.track?.kind || 'unknown'),
    senderTrackIds: senders.map((sender) => sender.track?.id || null),
  };
}

export function summarizePeerReceivers(pc: RTCPeerConnection): {
  receiverKinds: string[];
  receiverTrackIds: Array<string | null>;
} {
  const receivers = pc.getReceivers();
  return {
    receiverKinds: receivers.map((receiver) => receiver.track?.kind || 'unknown'),
    receiverTrackIds: receivers.map((receiver) => receiver.track?.id || null),
  };
}
