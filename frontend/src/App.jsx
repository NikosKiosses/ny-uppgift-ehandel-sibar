import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Homepage from './pages/Homepage';
import Kollektion from './pages/Kollektion';
import Productpage from './pages/Productpage';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Orderbekraftelse from './pages/Orderbekraftelse';
import MinaSidor from './pages/MinaSidor';
import Sok from './pages/Sok';
import Login from './pages/Login';
import AdminProducts from './pages/AdminProducts';
import AdminOrders from './pages/AdminOrders';
import Navbar from './Navbar';
import ProtectedRoute from './ProtectedRoute';
import { AuthProvider } from './AuthContext';
import { CartProvider } from './CartContext';
import { CurrencyProvider } from './CurrencyContext';
import { CustomerProvider } from './CustomerContext';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <CustomerProvider>
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
              <Route path="/orderbekraftelse" element={<Orderbekraftelse />} />
              <Route path="/mina-sidor" element={<MinaSidor />} />
              <Route path="/login" element={<Login />} />
              <Route path="/admin/products" element={<ProtectedRoute><AdminProducts /></ProtectedRoute>} />
              <Route path="/admin/orders" element={<ProtectedRoute><AdminOrders /></ProtectedRoute>} />
            </Routes>
          </BrowserRouter>
        </CurrencyProvider>
      </CartProvider>
      </CustomerProvider>
    </AuthProvider>
  );
}

export default App;