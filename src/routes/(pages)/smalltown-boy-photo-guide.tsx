import { createFileRoute } from '@tanstack/react-router';

import { staticPageRouteOptions } from './-static-page';

export const Route = createFileRoute('/(pages)/smalltown-boy-photo-guide')(
  staticPageRouteOptions('smalltown-boy-photo-guide')
);
