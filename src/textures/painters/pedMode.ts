/**
 * How a person's clothes are made. 'skin' (default): one clean skinned body, clothes mostly in the texture, the body itself dressed
 * by a smooth thickness field (volume of a puffer, the drop of a hoodie, the trouser leg) and extra geometry only where the silhouette needs
 * it (hood, coat hem, hat, bag, hair, shoes). 'shells': the older layered garment shells cut from the body surface (kept for before / after frames).
 */
export type PeopleMode = 'skin' | 'shells';
let mode: PeopleMode = 'skin';
export function peopleMode(): PeopleMode { return mode; }
export function setPeopleMode(m: PeopleMode): void { mode = m; }
