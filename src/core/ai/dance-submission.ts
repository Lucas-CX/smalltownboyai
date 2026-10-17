// Only the submission adapter can prove that no paid request was attempted.
// Never classify errors by message text: a timeout after createTask is ambiguous.
export class DancePreSubmissionError extends Error {
  constructor(readonly phase: string) {
    super(`PRE_SUBMISSION_${phase}`);
    this.name = 'DancePreSubmissionError';
  }
}
