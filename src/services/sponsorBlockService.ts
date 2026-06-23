const CATEGORIES = ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction'];

export async function fetchSponsorSegments(videoId: string): Promise<[number, number][]> {
  try {
    const cats = encodeURIComponent(JSON.stringify(CATEGORIES));
    const res = await fetch(
      `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${cats}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.status === 404) return []; // no segments for this video
    if (!res.ok) return [];
    const data: { segment: [number, number]; category: string }[] = await res.json();
    return data.map((s) => s.segment);
  } catch {
    return [];
  }
}
