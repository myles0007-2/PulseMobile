/**
 * Audio EQ Presets for Phase 4
 *
 * Equalizer presets for different music styles.
 * Currently defined as specs for future Expo Audio implementation.
 *
 * EQ Bands (standard 5-band):
 * - 60 Hz (bass)
 * - 250 Hz (low-mid)
 * - 1 kHz (mid)
 * - 4 kHz (high-mid)
 * - 16 kHz (treble)
 *
 * Gain: -12 to +12 dB (0 = no change)
 */

export interface EQBands {
  bass: number;      // 60 Hz (-12 to +12)
  lowMid: number;    // 250 Hz (-12 to +12)
  mid: number;       // 1 kHz (-12 to +12)
  highMid: number;   // 4 kHz (-12 to +12)
  treble: number;    // 16 kHz (-12 to +12)
}

export interface EQPreset {
  name: string;
  description: string;
  bands: EQBands;
}

export const EQ_PRESETS: Record<string, EQPreset> = {
  flat: {
    name: 'Flat',
    description: 'No equalization',
    bands: { bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0 },
  },
  rock: {
    name: 'Rock',
    description: 'Boosted bass and treble, scooped mid',
    bands: { bass: 5, lowMid: 2, mid: -4, highMid: 1, treble: 5 },
  },
  pop: {
    name: 'Pop',
    description: 'Balanced with slight mid boost for vocals',
    bands: { bass: 3, lowMid: 1, mid: 2, highMid: 2, treble: 2 },
  },
  podcast: {
    name: 'Podcast',
    description: 'Boosted mids and highs for voice clarity',
    bands: { bass: -3, lowMid: 1, mid: 4, highMid: 4, treble: 3 },
  },
};

export type EQPresetName = keyof typeof EQ_PRESETS;

export const EQ_PRESET_NAMES = Object.keys(EQ_PRESETS) as EQPresetName[];

export function getEQPreset(name: EQPresetName): EQPreset {
  return EQ_PRESETS[name];
}

/**
 * Apply EQ preset to audio player
 *
 * NOTE: Current implementation is placeholder.
 * Expo Audio.Sound does not expose EQ filters in public API as of SDK 52.
 * This function documents the interface for when Expo Audio adds native EQ support,
 * or when we implement via native module.
 *
 * Future implementations:
 * 1. Native module wrapping iOS AVAudioPlayerNode (supports per-band EQ)
 * 2. Native module wrapping Android ExoPlayer (supports parametric EQ)
 * 3. Expo Audio upgrade with native EQ support
 *
 * TODO: Implement actual EQ application when Expo Audio supports it
 */
export async function applyEQPreset(
  _soundInstance: any,
  presetName: EQPresetName
): Promise<void> {
  // Placeholder: No-op until EQ is available
  // In production, this would apply the preset bands to the audio player
  console.debug(`[Phase 4 TODO] Apply EQ preset: ${presetName}`);

  // Pseudo-code for future implementation:
  // const preset = getEQPreset(presetName);
  // await soundInstance.applyEQ({
  //   bands: [
  //     { frequency: 60, gain: preset.bands.bass },
  //     { frequency: 250, gain: preset.bands.lowMid },
  //     { frequency: 1000, gain: preset.bands.mid },
  //     { frequency: 4000, gain: preset.bands.highMid },
  //     { frequency: 16000, gain: preset.bands.treble },
  //   ]
  // });
}

/**
 * Reset all EQ to flat (default)
 */
export async function resetEQ(_soundInstance: any): Promise<void> {
  // Placeholder: No-op until EQ is available
  console.debug('[Phase 4 TODO] Reset EQ to flat');
  // In production: await soundInstance.applyEQ(getEQPreset('flat').bands);
}
