/** Pure toggle for star state (kept out of the "use server" file so it can be unit tested). */
export function nextStarState(current: boolean): boolean {
  return !current;
}
