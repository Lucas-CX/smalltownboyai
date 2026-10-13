import { createFileRoute } from '@tanstack/react-router';

import { staticPageRouteOptions } from './-static-page';

export const Route = createFileRoute('/(pages)/smalltown-boy-video-options')(
  staticPageRouteOptions('smalltown-boy-video-options')
);
