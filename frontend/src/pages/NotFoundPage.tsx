import { Link } from 'react-router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');

  return (
    <div className="sheet px-5 py-10">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-graphite">There is nothing at this address.</p>
      <Link to="/" className="mt-4 inline-block text-pen underline underline-offset-2 hover:text-pen-dark">
        Go to the dashboard
      </Link>
    </div>
  );
}
