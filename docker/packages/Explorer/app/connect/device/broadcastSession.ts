export type BroadcastStage =
  | 'idle'
  | 'camera_starting'
  | 'camera_ready'
  | 'live_session_starting'
  | 'live_session_ready'
  | 'peer_publishing'
  | 'waiting_for_answer'
  | 'connected'
  | 'failed'
  | 'stopped';

export type BroadcastFailureCode =
  | 'camera_unavailable'
  | 'camera_permission_denied'
  | 'camera_not_found'
  | 'camera_not_readable'
  | 'live_session_failed'
  | 'live_session_create_failed'
  | 'auth_failed'
  | 'auth_required'
  | 'missing_media_stream'
  | 'offer_publish_failed'
  | 'live_registry_mismatch'
  | 'answer_poll_failed'
  | 'peer_connection_failed'
  | 'unknown';

export type BroadcastFailure = {
  code: BroadcastFailureCode;
  message: string;
  cause?: string;
};

export type BroadcastSnapshot = {
  stage: BroadcastStage;
  nodeId: string | null;
  selectedDeviceId: string | null;
  cameraLabel: string | null;
  sessionId: string | null;
  sourceKind: 'camera' | 'screen' | null;
  peerStatus: 'idle' | 'offer-published' | 'connected' | 'failed';
  waitingForAnswer: boolean;
  error: BroadcastFailure | null;
  updatedAt: number;
};

export function describeBroadcastStage(snapshot: BroadcastSnapshot): string {
  if (snapshot.error) return `Failed: ${snapshot.error.message}`;
  switch (snapshot.stage) {
    case 'camera_starting':
      return 'Starting camera';
    case 'camera_ready':
      return 'Camera ready';
    case 'live_session_starting':
      return 'Starting live session';
    case 'live_session_ready':
      return 'Live session ready';
    case 'peer_publishing':
      return 'Publishing peer offer';
    case 'waiting_for_answer':
      return 'Waiting for Explorer answer';
    case 'connected':
      return 'Connected';
    case 'stopped':
      return 'Stopped';
    case 'failed':
      return 'Failed';
    default:
      return 'Idle';
  }
}

export function isBroadcastBusy(stage: BroadcastStage): boolean {
  return (
    stage === 'camera_starting' ||
    stage === 'live_session_starting' ||
    stage === 'peer_publishing'
  );
}

export function isBroadcastLive(stage: BroadcastStage): boolean {
  return stage === 'waiting_for_answer' || stage === 'connected';
}

export function makeBroadcastFailure(
  code: BroadcastFailureCode,
  cause?: unknown,
): BroadcastFailure {
  const text =
    cause instanceof Error ? cause.message : cause ? String(cause) : undefined;
  return { code, message: code.replaceAll('_', ' '), cause: text };
}
