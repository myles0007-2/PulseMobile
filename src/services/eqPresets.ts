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
 * Volume compensation for EQ presets
 *
 * Expo Audio.Sound does not expose EQ filters in public API (SDK 52).
 * This workaround uses volume multipliers to simulate EQ effects:
 * - Rock/Pop: Slightly louder (perceived bass/presence boost)
 * - Podcast: Slightly quieter (perceived voice clarity)
 * - Flat: Neutral
 *
 * Future: Implement via native iOS (AVAudioPlayerNode) / Android (ExoPlayer) module
 * or when Expo Audio adds native EQ support.
 */
export const EQ_VOLUME_MULTIPLIERS: Record<EQPresetName, number> = {
  flat: 1.0,      // No change
  rock: 1.05,     // +5% → perceived bass/treble boost
  pop: 1.02,      // +2% → perceived presence/vocal clarity
  podcast: 0.98,  // -2% → perceived clarity for voice
};

/**
 * Apply EQ preset to audio player
 *
 * Implementation: Volume compensation workaround (Expo limitation)
 * When Expo Audio adds native EQ support, this can be replaced with
 * actual per-band gain adjustment.
 */
export async function applyEQPreset(
  soundInstance: any,
  presetName: EQPresetName
): Promise<void> {
  try {
    // Get volume multiplier for this EQ preset
    const multiplier = EQ_VOLUME_MULTIPLIERS[presetName] || 1.0;

    // Get current volume (default to 1.0 if not accessible)
    let currentVolume = 1.0;
    try {
      const status = await soundInstance.getStatusAsync();
      if (status.isLoaded && typeof status.volume === 'number') {
        currentVolume = status.volume;
      }
    } catch {
      // If we can't get status, use default
    }

    // Apply volume adjustment to simulate EQ effect
    const adjustedVolume = Math.min(1.0, Math.max(0.0, currentVolume * multiplier));
    await soundInstance.setVolumeAsync(adjustedVolume);

    console.log(`[EQ Presets] Applied "${presetName}" preset (volume: ${adjustedVolume.toFixed(2)})`);
  } catch (error) {
    console.warn(`[EQ Presets] Failed to apply preset:`, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Reset all EQ to flat (default)
 */
export async function resetEQ(_soundInstance: any): Promise<void> {
  // Placeholder: No-op until EQ is available
  console.debug('[Phase 4 TODO] Reset EQ to flat');
  // In production: await soundInstance.applyEQ(getEQPreset('flat').bands);
}
