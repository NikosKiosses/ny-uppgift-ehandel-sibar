import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from './CartContext';
import CurrencySelect from './CurrencySelect';

function Navbar() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cart } = useCart();

  // Sökfältet visar det som står i URL:en (t.ex. när man är på /sok?q=hoodie)
  const [text, setText] = useState(searchParams.get('q') ?? '');
  useEffect(() => {
    setText(searchParams.get('q') ?? '');
  }, [searchParams]);

  function handleSubmit(e) {
    e.preventDefault();   // ladda inte om sidan
    const q = text.trim();
    navigate(q ? `/sok?q=${encodeURIComponent(q)}` : '/sok');
  }

  return (
    <header className="navbar">
      <nav className="navbar-links">
        <Link to="/">Hem</Link>
        <Link to="/kollektion">Kollektion</Link>
      </nav>

      <Link to="/" className="navbar-logo">
        <img src="/logo.png" alt="KLEOS" />
      </Link>

      <div className="navbar-actions">
        <form className="navbar-search" onSubmit={handleSubmit} role="search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            type="search"
            placeholder="Sök..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Sök produkter"
          />
        </form>

        <Link to="/login" className="navbar-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
          <span>Logga in</span>
        </Link>

        <Link to="/cart" className="navbar-icon">
          <span className="navbar-cart">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 7h12l-1 14H7L6 7z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
            {cart.length > 0 && <span className="navbar-badge">{cart.length}</span>}
          </span>
          <span>Varukorg</span>
        </Link>

        <CurrencySelect />
      </div>
    </header>
  );
}

export default Navbar;