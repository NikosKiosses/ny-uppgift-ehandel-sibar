import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    const result = await login(email, password);
    if (result.success) {
      navigate('/admin/products');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '400px' }}>
      <h1 style={{ fontSize: '24px', lineHeight: '1.4', marginBottom: '20px' }}>Admin - Logga in</h1>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: 'block', marginBottom: '12px', width: '100%', padding: '8px' }} />
      <input placeholder="Lösenord" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: 'block', marginBottom: '12px', width: '100%', padding: '8px' }} />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button className="btn" onClick={handleSubmit}>Logga in</button>
    </div>
  );
}

export default Login;