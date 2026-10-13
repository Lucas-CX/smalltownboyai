import { createFileRoute } from '@tanstack/react-router';

import { staticPageRouteOptions } from './-static-page';

export const Route = createFileRoute('/(pages)/smalltown-boy-cat-dance')(
  staticPageRouteOptions('smalltown-boy-cat-dance')
);
