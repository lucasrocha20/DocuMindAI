import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
