import { useEffect, useRef, useState } from 'react';

import { startDancePreview } from '@/lib/dance-video-preview';
import {
  videoFailureFromState,
  videoMediaFailure,
  type VideoFailureReason,
  type VideoFileState,
} from '@/lib/dance-video-state';

type Props = {
  src: string;
  label: string;
  errorLabel: string;
  retryLabel: string;
  openLabel: string;
  poster?: string;
  lazyPoster?: boolean;
  pauseWhenOffscreen?: boolean;
  autoPreview?: boolean;
  previewLabels?: { play: string; pause: string; mute: string; unmute: string };
  className?: string;
  reference?: boolean;
  preload?: 'none' | 'metadata';
  width?: number;
  height?: number;
  onPlaybackError?: (reason: VideoFailureReason) => void;
  diagnose?: () => Promise<VideoFileState>;
  errorLabels?: Partial<Record<VideoFailureReason, string>>;
  signIn?: { href: string; label: string };
  onRetry?: () => void;
  onRecovered?: () => void;
  title?: string;
  playLabel?: string;
  description?: string;
};

export function DanceVideo({
  src,
  label,
  errorLabel,
  retryLabel,
  openLabel,
  poster,
  lazyPoster = false,
  pauseWhenOffscreen = false,
  autoPreview = false,
  previewLabels,
  className,
  reference,
  preload,
  width,
  height,
  onPlaybackError,
  diagnose,
  errorLabels,
  signIn,
  onRetry,
  onRecovered,
  title,
  playLabel,
  description,
}: Props) {
  const [failure, setFailure] = useState<VideoFailureReason>();
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [silent, setSilent] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const request = useRef(0);
  const recovering = useRef(false);
  const [posterVisible, setPosterVisible] = useState(!lazyPoster);
  useEffect(() => {
    const target = video.current;
    if (!autoPreview || !target || !('IntersectionObserver' in window)) return;
    target.muted = true;
    return startDancePreview(
      target,
      document,
      window.matchMedia('(prefers-reduced-motion: reduce)'),
      (onVisible) => {
        const observer = new IntersectionObserver(
          (entries) => {
            onVisible(
              entries.some(
                (entry) =>
                  entry.isIntersecting && entry.intersectionRatio >= 0.5
              )
            );
          },
          { threshold: [0, 0.5] }
        );
        observer.observe(target);
        return () => observer.disconnect();
      }
    );
  }, [autoPreview, src, attempt]);
  useEffect(() => {
    request.current++;
    recovering.current = false;
    setFailure(undefined);
    setChecking(false);
    return () => {
      request.current++;
    };
  }, [src]);
  useEffect(() => {
    if (!lazyPoster || posterVisible) return;
    if (!('IntersectionObserver' in window)) {
      setPosterVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPosterVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    if (video.current) observer.observe(video.current);
    return () => observer.disconnect();
  }, [lazyPoster, posterVisible, attempt]);
  useEffect(() => {
    if (!pauseWhenOffscreen || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.intersectionRatio < 0.5)) {
          video.current?.pause();
        }
      },
      { threshold: 0.5 }
    );
    if (video.current) observer.observe(video.current);
    return () => observer.disconnect();
  }, [pauseWhenOffscreen, attempt]);
  return (
    <>
      {title && (
        <h3>
          <button
            type="button"
            className="dance-example-play"
            disabled={!!failure}
            onClick={() => {
              const target = video.current;
              if (!target) return;
              target.scrollIntoView({ block: 'nearest' });
              void target.play().catch(() => {
                // Native controls remain available; don't surface an unhandled promise.
                target.focus();
              });
            }}
          >
            <span aria-hidden="true">▶ </span>
            {title}
            {playLabel && <small> · {playLabel}</small>}
          </button>
        </h3>
      )}
      {description && <p>{description}</p>}
      <video
        ref={video}
        key={`${src}:${attempt}`}
        className={className}
        width={width}
        height={height}
        controls
        playsInline
        preload={preload ?? (reference ? 'none' : 'metadata')}
        muted={autoPreview || reference}
        loop={autoPreview || reference}
        poster={!lazyPoster || posterVisible ? poster : undefined}
        src={src}
        aria-label={label}
        hidden={!!failure}
        onPause={() => setPlaying(false)}
        onVolumeChange={(event) => setSilent(event.currentTarget.muted)}
        onPlaying={() => {
          if (recovering.current) {
            recovering.current = false;
            onRecovered?.();
          }
        }}
        onPlay={() => {
          setPlaying(true);
          if (!pauseWhenOffscreen) return;
          video.current
            ?.closest('[data-dance-video-gallery]')
            ?.querySelectorAll('video')
            .forEach((other) => {
              if (other !== video.current) other.pause();
            });
        }}
        onError={async (event) => {
          const current = ++request.current;
          const media = videoMediaFailure(
            event.currentTarget.error?.code,
            navigator.onLine
          );
          recovering.current = true;
          setFailure(media);
          setChecking(!!diagnose);
          let reason = media;
          if (diagnose) {
            try {
              reason = videoFailureFromState(media, await diagnose());
            } catch {
              reason = 'video_network';
            }
          }
          if (current !== request.current) return;
          setFailure(reason);
          setChecking(false);
          onPlaybackError?.(reason);
        }}
      />
      {autoPreview && previewLabels && !failure && (
        <div className="dance-preview-controls">
          <button
            type="button"
            onClick={() => {
              const target = video.current;
              if (!target) return;
              if (target.paused) void target.play().catch(() => target.focus());
              else target.pause();
            }}
          >
            {playing ? previewLabels.pause : previewLabels.play}
          </button>
          <button
            type="button"
            onClick={() => {
              if (video.current) video.current.muted = !video.current.muted;
            }}
          >
            {silent ? previewLabels.unmute : previewLabels.mute}
          </button>
        </div>
      )}
      {failure && (
        <div className="dance-video-error" role="status">
          <p>{errorLabels?.[failure] || errorLabel}</p>
          {failure === 'authentication_required' && signIn ? (
            <a href={signIn.href}>{signIn.label}</a>
          ) : (
            failure !== 'video_expired' &&
            failure !== 'video_missing' && (
              <button
                type="button"
                disabled={checking}
                onClick={() => {
                  request.current++;
                  setFailure(undefined);
                  setAttempt((v) => v + 1);
                  onRetry?.();
                }}
              >
                {retryLabel}
              </button>
            )
          )}
          {![
            'video_expired',
            'video_missing',
            'authentication_required',
          ].includes(failure) && (
            <a href={src} target="_blank" rel="noopener noreferrer">
              {openLabel}
            </a>
          )}
        </div>
      )}
    </>
  );
}
