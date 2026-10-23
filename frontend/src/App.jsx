import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Homepage from './pages/Homepage';
import Kollektion from './pages/Kollektion';
import Productpage from './pages/Productpage';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Orderb from './pages/Orderb';
import Sok from './pages/Sok';
import Login from './pages/Login';
import AdminProducts from './pages/AdminProducts';
import AdminOrders from './pages/AdminOrders';
import Navbar from './Navbar';
import ProtectedRoute from './ProtectedRoute';
import { AuthProvider } from './AuthContext';
import { CartProvider } from './CartContext';
import { CurrencyProvider } from './CurrencyContext';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <CurrencyProvider>
          <BrowserRouter>
            <Navbar />
            <Routes>
              <Route path="/" element={<Homepage />} />
              <Route path="/kollektion" element={<Kollektion />} />
              <Route path="/sok" element={<Sok />} />
              <Route path="/product" element={<Productpage />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/orderb" element={<Orderb />} />
              <Route path="/login" element={<Login />} />
              <Route path="/admin/products" element={<ProtectedRoute><AdminProducts /></ProtectedRoute>} />
              <Route path="/admin/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
            </Routes>
          </BrowserRouter>
        </CurrencyProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;