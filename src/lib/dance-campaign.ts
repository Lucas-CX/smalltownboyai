const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
export function cleanDanceCampaign(value: Record<string, unknown>) {
  const result: Partial<Record<(typeof campaignKeys)[number], string>> = {};
  for (const key of campaignKeys) {
    const entry = value[key];
    if (typeof entry === 'string' && /^[a-z0-9_-]{1,80}$/.test(entry))
      result[key] = entry;
  }
  return result;
}

// Keep only campaign labels, never arbitrary URL parameters or referrer URLs.
// First tagged entry in this tab survives navigation to login and back.
export function readDanceCampaign() {
  if (typeof window === 'undefined') return {};
  try {
    const saved = sessionStorage.getItem('dance-campaign');
    if (saved) return cleanDanceCampaign(JSON.parse(saved));
    const campaign = cleanDanceCampaign(
      Object.fromEntries(new URLSearchParams(window.location.search))
    );
    if (Object.keys(campaign).length)
      sessionStorage.setItem('dance-campaign', JSON.stringify(campaign));
    return campaign;
  } catch {
    return {};
  }
}
