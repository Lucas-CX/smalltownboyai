// Explicit one-shot local maintenance only. Production uses callbacks and refresh.
import { restoreFailedDanceCredits } from '../src/modules/ai-tasks/service';
import { getAllConfigs } from '../src/modules/config/service';
import { tick } from '../src/modules/dance/service';

if (
  process.env.NODE_ENV === 'production' ||
  process.env.DANCE_CLOUD_ENABLED === 'true'
)
  throw new Error(
    'No recurring production worker. Use task callbacks or authenticated refresh.'
  );
const config = await getAllConfigs();
try {
  await tick(config.kie_api_key);
} finally {
  await restoreFailedDanceCredits();
}
