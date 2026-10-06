import { Link } from 'react-router-dom';

function Homepage() {
  return (
    <div className="page-container" style={{ textAlign: 'center', paddingTop: '60px' }}>
      <img src="/logo.png" alt="ΚΛΕΟΣ" width="120" style={{ marginBottom: '24px' }} />
      <h1 style={{ fontSize: '32px', marginBottom: '12px' }}>ΚΛΕΟΣ</h1>
      <p style={{ color: '#555', marginBottom: '24px' }}>Streetwear inspirerat av grekisk arv. Ära i varje plagg.</p>
      <Link to="/kollektion" className="btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
        Handla nu
      </Link>
    </div>
  );
}

export default Homepage;