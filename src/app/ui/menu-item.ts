import { IconName } from "../shared/icon/icon-paths";

/** One row of a menu: an action, or a separator line. */
export type UiMenuItem = { label: string; icon?: IconName; command: () => void } | { separator: true };
