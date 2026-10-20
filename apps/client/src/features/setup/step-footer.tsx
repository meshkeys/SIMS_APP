import { Button } from '@/components/ui/button';

/**
 * Back, "Save and finish later" and Continue. Both save buttons submit the
 * step's form; the form tells them apart with `intentOf`. A hidden
 * Continue comes first, so Enter in a field continues.
 */
export function StepFooter({
  formId,
  saving,
  onBack,
  continueLabel = 'Continue',
  canContinue = true,
}: {
  formId: string;
  saving: boolean;
  onBack?: () => void;
  continueLabel?: string;
  canContinue?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {onBack ? (
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          Back
        </Button>
      ) : (
        <span />
      )}
      {/* Enter in a field presses the first submit button in the page:
          this hidden one, so Enter continues rather than stopping. */}
      <button
        type="submit"
        form={formId}
        value="continue"
        disabled={!canContinue || saving}
        hidden
        tabIndex={-1}
        aria-label={continueLabel}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          form={formId}
          value="later"
          variant="link"
          disabled={saving}
        >
          Save and finish later
        </Button>
        <Button
          type="submit"
          form={formId}
          value="continue"
          loading={saving}
          disabled={!canContinue}
        >
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
