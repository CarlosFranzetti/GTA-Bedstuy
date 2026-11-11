/** Build with VITE_ENV14=0 to switch the ENV14 accuracy layer off (observed facades, census tree sizes, class-based water tanks) for before/after captures. */
export const ENV14_ON = (import.meta as { env?: Record<string, string> }).env?.VITE_ENV14 !== '0';
