export type Destroyable = {
  destroy: () => void;
};

export type OpenCloseController = Destroyable & {
  open: () => void;
  close: (onDone?: () => void) => void;
};
