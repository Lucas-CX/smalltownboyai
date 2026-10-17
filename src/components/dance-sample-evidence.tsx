import { danceTrendPreview } from '@/lib/dance-media';
import { inlineVideoProps } from '@/lib/inline-video';

export function DanceSampleEvidence({
  roleA,
  roleB,
  videoLabel,
  caption,
}: {
  roleA: string;
  roleB: string;
  videoLabel: string;
  caption: string;
}) {
  return (
    <div className="my-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {danceTrendPreview.cast.map((src, index) => (
          <figure key={src}>
            <img
              src={src}
              alt={index === 0 ? roleA : roleB}
              loading="lazy"
              className="bg-muted aspect-square w-full rounded-xl object-contain"
            />
            <figcaption className="mt-2 text-sm">
              {index === 0 ? roleA : roleB}
            </figcaption>
          </figure>
        ))}
      </div>
      <figure>
        <video
          controls
          {...inlineVideoProps}
          preload="none"
          poster={danceTrendPreview.poster}
          width={danceTrendPreview.width}
          height={danceTrendPreview.height}
          aria-label={videoLabel}
          className="mx-auto max-h-[70svh] w-full rounded-xl bg-black object-contain"
        >
          <source src={danceTrendPreview.src} type="video/mp4" />
        </video>
        <figcaption className="text-muted-foreground mt-3 text-sm leading-6">
          {caption}
        </figcaption>
      </figure>
    </div>
  );
}
