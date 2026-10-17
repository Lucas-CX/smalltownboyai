import { inlineVideoProps } from '@/lib/inline-video';

type SocialVideo = {
  id: string;
  title: string;
  videoSrc: string;
  poster: string;
};

export function SocialVideoGallery({
  items,
}: {
  items: readonly SocialVideo[];
}) {
  return (
    <div className="dance-social-grid">
      {items.map((item) => (
        <article className="dance-social-item" key={item.id}>
          <h3>{item.title}</h3>
          <video
            className="dance-social-player dance-social-local"
            src={item.videoSrc}
            poster={item.poster}
            controls
            {...inlineVideoProps}
            preload="none"
            aria-label={item.title}
          />
        </article>
      ))}
    </div>
  );
}
