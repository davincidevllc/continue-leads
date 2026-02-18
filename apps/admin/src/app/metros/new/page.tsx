import AuthLayout from '@/components/AuthLayout';
import MetroForm from '../MetroForm';

export default function NewMetroPage() {
  return (
    <AuthLayout>
      <h4 className="mb-4">New Metro</h4>
      <div className="card"><div className="card-body"><MetroForm /></div></div>
    </AuthLayout>
  );
}
