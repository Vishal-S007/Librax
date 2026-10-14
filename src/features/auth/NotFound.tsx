import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/Feedback';
import { useBase } from '@/hooks/useRole';

export default function NotFound() {
  const base = useBase();
  return (
    <div className="card">
      <EmptyState
        icon={Compass}
        title="This page isn’t on the shelf"
        body="The address may be mistyped, or the page is not available for your role."
        action={<Link to={base} className="rounded-control bg-brass px-4 py-2 text-sm font-medium text-brass-ink">Back to home</Link>}
      />
    </div>
  );
}
