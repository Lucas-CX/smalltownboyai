import { m } from '@/paraglide/messages.js';

const supportEmail = 'support@smalltownboyai.video';

export function DanceSupportEmail({ taskId }: { taskId?: string }) {
  const subject = taskId
    ? m['dance.help.task_subject']({ id: taskId })
    : m['dance.help.subject']();
  return (
    <span className="block min-w-0 text-sm leading-relaxed">
      {m['dance.help.email_label']()}{' '}
      <a
        className="block max-w-full break-all underline underline-offset-4"
        href={`mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(m['dance.help.body']())}`}
      >
        {supportEmail}
      </a>
    </span>
  );
}
