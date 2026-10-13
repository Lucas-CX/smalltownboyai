import { createFileRoute } from '@tanstack/react-router';

import { staticPageRouteOptions } from './-static-page';

export const Route = createFileRoute('/(pages)/smalltown-boy-sample')(
  staticPageRouteOptions('smalltown-boy-sample')
);
