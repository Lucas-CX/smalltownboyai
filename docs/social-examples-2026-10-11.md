# Social video examples

## Final user selection

The user selected competitor candidates 08, 10 and 14 and stated that all
were authorized, requesting no visible source labels. These files are now
`public/media/social-remixes/sample-08.mp4`, `sample-10.mp4` and `sample-14.mp4`,
with matching JPG posters. They appear first, followed by the three previous
local character examples. The former remote embeds have been removed from
the gallery. Public cards show a sample title and native playback controls;
creator names, platform labels, metrics and source links are no longer rendered.
No claim that these are outputs of our service was added. The original source
manifest remains in the local candidate directory for bookkeeping. Authorization
is based on the user's statement, not a separate license audit.

The sections below record the earlier collection process.

Checked October 11, 2026 (Asia/Shanghai). The initial four posts use public
platform embeds. The user subsequently requested downloaded AI character
remixes; three additional public videos are saved as MP4 files and displayed
with local players. Existing generated sample and generation reference remain
unchanged.

## Downloaded character remixes

| Cast                                        | Creator / original post                                            | Likes snapshot | Local MP4                                                      |
| ------------------------------------------- | ------------------------------------------------------------------ | -------------- | -------------------------------------------------------------- |
| Mona Lisa and the Girl with a Pearl Earring | https://www.instagram.com/reel/DeSBAITiEH5/ by yapayzekatasarliyor | 63,367         | public/media/social-remixes/louvre-duo-DeSBAITiEH5.mp4         |
| Van Gogh and Mona Lisa                      | https://www.instagram.com/reel/DeCAHUpvxzx/ by ali_altaawil        | 25,200         | public/media/social-remixes/van-gogh-mona-lisa-DeCAHUpvxzx.mp4 |
| Iron Man and Thor                           | https://www.instagram.com/reel/DeNFLmwTxV4/ by faith_creatorai     | 1,881          | public/media/social-remixes/iron-man-duo-DeNFLmwTxV4.mp4       |

All three were visually inspected through public Instagram embeds, then
downloaded from each rendered video's currentSrc. No login bypass or watermark
removal. H.264 video and AAC audio verified locally: 17.16s, 22.14s and 14.79s
respectively. Download originals are also kept in
`output/social-samples/2026-10-11/`. Public files are byte-identical copies;
WebP posters are extracted at one second. Like counts are primary-source
snapshots, not verified play counts. The superhero clip is a lower-engagement
role-replacement example, not presented as a million-view hit.

The art creator explicitly credits the original duo and describes AI generation.
The additional videos illustrate different characters and settings; they are
not outputs or additional selectable templates of this service. Original
attribution and source links remain visible. Downloading does not establish a
license or creator endorsement.

Excluded after inspection: the 354,115-like vishvrajaistudio Hulk clip uses a
different performance format; several final.prompt and other candidates are
animal clips rather than the requested human/character remixes. Third-party
showcase view counts were not trusted.

| Creator                     | Source                                                            | Verified popularity snapshot |
| --------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| elvira.mua.music + mr_unvrs | https://www.instagram.com/p/DbnS23ZKVFv/                          | 194,427 likes                |
| zefosik                     | https://www.tiktok.com/@zefosik/video/7694386654563339550         | 1,400,000 plays              |
| bellvtrix.ai + mr_unvrs     | https://www.instagram.com/bellvtrix.ai/reel/Dd_tbbsNrvu/          | 1,276,758 likes              |
| fluffyfishlover             | https://www.tiktok.com/@fluffyfishlover/video/7692186349922749716 | 380,300 plays                |

TikTok counts came from the matching item ID in the public post's
`__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON (`webapp.video-detail.itemInfo.itemStruct.stats`).
Instagram like counts came from the public embed, with creator names checked
against the rendered embed. Instagram play counts were unavailable. Do not
relabel likes as views or treat these snapshots as live counters.

Discovery included TikTok, Instagram and YouTube searches. YouTube searches
did not yield a sufficiently verified matching Short. A TikTok repost by
rick.rivera_29 had only 15,300 plays and was excluded. Discovery pages:
https://www.makeviral.ai/templates/smalltown-boy-ai-dance,
https://smalltownboydance.org/ and
https://remakeyourmeme.com/templates/smalltown-boy-cat-dance/.
Their popularity claims were not used in place of the primary checks above.

The downloaded character remixes appear first. Each post keeps attribution and an original-post
link. The section explicitly identifies these as creator references, not
outputs of this service. Only the existing red-fence generation template is
available; embedding the living-room variation does not add a new template.
Third-party playback remains subject to availability and regional restrictions.

Validation: `pnpm build` and `pnpm exec tsc --noEmit` passed. Browser checks
covered English desktop (1280px), Chinese mobile (390px), visible creator
media, direct source links, and no document horizontal overflow. Screenshot
evidence is under ignored `output/playwright/social-*`. Third-party telemetry
requests produced console errors; these were not application build failures.
No production deployment, paid generation, or payment action was performed.
