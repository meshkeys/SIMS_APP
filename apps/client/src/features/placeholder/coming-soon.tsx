import { Hammer } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';

/** Stand-in for a screen that a later slice builds. */
export function ComingSoon({
  title,
  eyebrow,
}: {
  title: string;
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={eyebrow} title={title} />
      <Card>
        <EmptyState
          icon={<Hammer />}
          title="This screen is being built"
          description="Its API is ready; the screen arrives in an upcoming slice."
        />
      </Card>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Page not found" />
      <Card>
        <EmptyState
          title="There is nothing at this address"
          description="Check the link, or use the menu to find what you need."
        />
      </Card>
    </div>
  );
}
