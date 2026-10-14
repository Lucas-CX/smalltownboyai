// Usage: node scripts/campaign-link.mjs instagram social launch_20261014 [path]
const [source, medium, campaign, path = '/'] = process.argv.slice(2);
if (
  ![source, medium, campaign].every((v) => /^[a-z0-9_-]{1,80}$/.test(v || ''))
) {
  throw new Error(
    'Provide source medium campaign using lowercase letters, numbers, _ or -'
  );
}
const url = new URL(path, 'https://smalltownboyai.video');
if (url.origin !== 'https://smalltownboyai.video' || url.search || url.hash) {
  throw new Error('Use a site path without query parameters or fragments');
}
url.search = new URLSearchParams({
  utm_source: source,
  utm_medium: medium,
  utm_campaign: campaign,
}).toString();
console.log(url.href);
