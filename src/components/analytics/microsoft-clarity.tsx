import { useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';

import {
  initializeClarity,
  isClarityPageAllowed,
  recoverClarityInitialization,
  stopClarity,
} from '@/lib/clarity';

export function MicrosoftClarity({ projectId }: { projectId: string }) {
  const router = useRouter();
  useEffect(() => {
    initializeClarity(projectId);
    const stopRecovery = recoverClarityInitialization(projectId);
    window.addEventListener('dance-diagnostics-enabled', stopClarity);
    const unsubscribeBefore = router.subscribe(
      'onBeforeNavigate',
      ({ toLocation }) => {
        if (!isClarityPageAllowed(toLocation.pathname, toLocation.searchStr))
          stopClarity();
      }
    );
    const unsubscribeAfter = router.subscribe('onResolved', () =>
      initializeClarity(projectId)
    );
    return () => {
      window.removeEventListener('dance-diagnostics-enabled', stopClarity);
      stopRecovery();
      unsubscribeBefore();
      unsubscribeAfter();
    };
  }, [projectId, router]);
  return null;
}
