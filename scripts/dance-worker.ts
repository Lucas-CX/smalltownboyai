import { restoreFailedDanceCredits } from '../src/modules/ai-tasks/service';
import { getAllConfigs } from '../src/modules/config/service';
import { tick } from '../src/modules/dance/service';

let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
console.log(
  'Dance local worker: real generation requires an explicit single-use permit.'
);
while (!stopping) {
  try {
    const config = await getAllConfigs();
    await tick(config.kie_api_key);
    await restoreFailedDanceCredits();
  } catch {
    console.error('Worker unavailable; check sandbox/database configuration.');
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
