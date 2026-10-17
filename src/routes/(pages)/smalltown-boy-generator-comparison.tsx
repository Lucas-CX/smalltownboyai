import { createFileRoute } from '@tanstack/react-router';

import { staticPageRouteOptions } from './-static-page';

export const Route = createFileRoute(
  '/(pages)/smalltown-boy-generator-comparison'
)(staticPageRouteOptions('smalltown-boy-generator-comparison'));
