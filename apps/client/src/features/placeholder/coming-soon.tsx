import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';

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
