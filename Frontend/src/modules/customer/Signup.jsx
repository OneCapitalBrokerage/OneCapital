import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const Signup = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      navigate('/login');
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806] flex flex-col">
      <div className="flex-shrink-0 pt-12 pb-6 px-6 text-center">
        <div className="w-16 h-16 mx-auto bg-gradient-to-br from-primary to-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-4">
          <span className="text-3xl font-bold text-white">W</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[#e8f3ee]">Create Account</h1>
        <p className="text-gray-500 dark:text-[#9cb7aa] mt-2">Start trading in minutes</p>
      </div>

      <div className="flex-1 px-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 text-sm p-3 rounded-xl flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Enter your full name" className="w-full px-4 py-3.5 bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary outline-none" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Enter your email" className="w-full px-4 py-3.5 bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary outline-none" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone</label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="+91 98765 43210" className="w-full px-4 py-3.5 bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary outline-none" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} placeholder="Create a password" className="w-full px-4 py-3.5 bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary outline-none" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</label>
            <input type={showPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="Confirm your password" className="w-full px-4 py-3.5 bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary outline-none" />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50">
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="text-center mt-6">
          <p className="text-gray-500">Already have an account? <Link to="/login" className="text-primary font-semibold">Sign In</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Signup;