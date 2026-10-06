import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Homepage from './pages/Homepage';
import Kollektion from './pages/Kollektion';
import Productpage from './pages/Productpage';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Orderb from './pages/Orderb';
import { CartProvider } from './CartContext';
import AdminProducts from './pages/AdminProducts';
import AdminOrders from './pages/AdminOrders';
import './App.css';
import { AuthProvider } from './AuthContext';
import ProtectedRoute from './ProtectedRoute';
import Login from './pages/Login';

function App() {
  return (
    <AuthProvider>
    <CartProvider>
    <BrowserRouter>
    <nav className='navbar'>
    <img src="/logo.png" alt="KLEOS" width="50" />
    <Link to= "/">Hem</Link>
    <Link to= "/kollektion">Kollektion</Link>
    <Link to= "/cart">Varukorg</Link>
    <Link to="/login">Logga in</Link>


    </nav>
      <Routes>
        <Route path="/kollektion" element={<Kollektion />} />
        <Route path="/product" element={<Productpage />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/orderb" element={<Orderb />} />
        <Route path="/" element={<Homepage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/products" element={<ProtectedRoute><AdminProducts /></ProtectedRoute>} />
        <Route path="/admin/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
    </CartProvider>
    </AuthProvider>
  );
}

export default App;