import { IconName } from "../shared/icon/icon-paths";

/** One row of a menu: an action, or a separator line. */
export type UiMenuItem =
  /** `keys`: a single-key shortcut shown at the item's right, which is also its `aria-keyshortcuts` (U-032). */
  { label: string; icon?: IconName; keys?: string; command: () => void } | { separator: true };
