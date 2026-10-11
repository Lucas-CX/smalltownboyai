type PreviewVideo = Pick<
  HTMLVideoElement,
  | 'paused'
  | 'ended'
  | 'play'
  | 'pause'
  | 'addEventListener'
  | 'removeEventListener'
>;
type PreviewDocument = Pick<
  Document,
  'hidden' | 'addEventListener' | 'removeEventListener'
>;
type MotionPreference = Pick<
  MediaQueryList,
  'matches' | 'addEventListener' | 'removeEventListener'
>;

// Automatic playback is an enhancement: a rejected play() leaves native controls usable.
export function startDancePreview(
  video: PreviewVideo,
  page: PreviewDocument,
  motion: MotionPreference,
  observe: (onVisible: (visible: boolean) => void) => () => void
) {
  let visible = false;
  let disposed = false;
  let userPaused = false;
  let expectedPause = false;
  let pending = false;
  let blocked = false;
  const allowed = () => visible && !page.hidden && !motion.matches;
  const pause = () => {
    if (!video.paused) {
      expectedPause = true;
      video.pause();
    }
  };
  const update = () => {
    if (disposed) return;
    if (!allowed()) {
      pause();
      return;
    }
    if (!video.paused || userPaused || pending || blocked) return;
    pending = true;
    void video
      .play()
      .catch(() => {
        // Browser autoplay policy is not a media failure and should not pollute errors.
        blocked = true;
      })
      .finally(() => {
        pending = false;
        if (disposed || !allowed()) pause();
      });
  };
  const onPause = () => {
    if (expectedPause) expectedPause = false;
    else if (!video.ended) userPaused = true;
  };
  const onPlay = () => {
    userPaused = false;
    // Reduced-motion visitors can still start a video explicitly with native controls.
    if (disposed || !visible || page.hidden) pause();
  };
  video.addEventListener('pause', onPause);
  video.addEventListener('play', onPlay);
  page.addEventListener('visibilitychange', update);
  motion.addEventListener('change', update);
  const disconnect = observe((value) => {
    visible = value;
    update();
  });
  return () => {
    disposed = true;
    disconnect();
    video.removeEventListener('pause', onPause);
    video.removeEventListener('play', onPlay);
    page.removeEventListener('visibilitychange', update);
    motion.removeEventListener('change', update);
    pause();
  };
}
