import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../../api/admin';

const KYC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [kycRequests, setKycRequests] = useState([]);

  // Fetch KYC requests from API
  const fetchKycRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getKycRequests({
        status: activeTab.toLowerCase(),
        page: currentPage,
        limit: 20
      });
      
      const requestsData = response.requests || response.data || [];
      setKycRequests(requestsData.map(request => ({
        id: request.id || request._id,
        name: request.name || 'Unknown',
        email: request.email || 'N/A',
        phone: request.phone || 'N/A',
        panNumber: request.panNumber || 'N/A',
        aadharNumber: request.aadhaarNumber || 'N/A',
        status: request.status ? request.status.charAt(0).toUpperCase() + request.status.slice(1) : 'Pending',
        submittedAt: request.submittedAt ? new Date(request.submittedAt).toLocaleDateString() : 'Unknown',
        documents: Object.entries(request.documents || {}).filter(([, v]) => v).map(([k]) => k),
        broker: 'N/A'
      })));

      if (response.pagination) {
        setTotalPages(response.pagination.pages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch KYC requests:', err);
      setError(err.message || 'Failed to load KYC requests');
      setKycRequests([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, currentPage]);

  useEffect(() => {
    fetchKycRequests();
  }, [fetchKycRequests]);

  const handleApprove = async (requestId) => {
    try {
      await adminApi.approveKyc(requestId);
      // Refresh the list
      fetchKycRequests();
    } catch (err) {
      console.error('Failed to approve KYC request:', err);
      setError(err.message || 'Failed to approve KYC request');
    }
  };

  const handleReject = async (requestId, reason) => {
    try {
      await adminApi.rejectKyc(requestId, reason);
      // Refresh the list
      fetchKycRequests();
    } catch (err) {
      console.error('Failed to reject KYC request:', err);
      setError(err.message || 'Failed to reject KYC request');
    }
  };

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden pb-20 sm:pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="flex size-9 sm:size-10 rounded-full hover:bg-gray-100 transition-colors items-center justify-center"
          >
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">KYC Approvals</h1>
        </div>
        <button className="flex items-center justify-center size-9 sm:size-10 rounded-full hover:bg-gray-100 transition-colors relative">
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">notifications</span>
          <span className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 size-2 bg-red-500 rounded-full border border-white"></span>
        </button>
      </header>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-200 px-3 sm:px-4">
        {['Pending', 'Approved', 'Rejected'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[#137fec] text-[#137fec]'
                : 'border-transparent text-[#617589] hover:text-[#111418]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-3 sm:p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex flex-col gap-3 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
                <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : kycRequests.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <span className="material-symbols-outlined text-[64px] text-gray-300 mb-4">verified</span>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No KYC Requests</h3>
            <p className="text-gray-500 text-center">No {activeTab.toLowerCase()} KYC requests at the moment</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-3">
            {kycRequests.map((request) => (
              <div key={request.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{request.name}</h3>
                    <p className="text-sm text-gray-500">{request.email}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    request.status === 'Approved' ? 'bg-green-100 text-green-800' :
                    request.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {request.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                  <div>
                    <p className="text-gray-500">PAN</p>
                    <p className="font-medium">{request.panNumber}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Aadhar</p>
                    <p className="font-medium">{request.aadharNumber}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Phone</p>
                    <p className="font-medium">{request.phone}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Submitted</p>
                    <p className="font-medium">{request.submittedAt}</p>
                  </div>
                </div>
                
                <div className="mb-3">
                  <p className="text-gray-500 text-sm mb-1">Documents</p>
                  <div className="flex flex-wrap gap-1">
                    {request.documents.map((doc, idx) => (
                      <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                        {doc}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-500">Broker: {request.broker}</p>
                  {activeTab === 'Pending' && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleReject(request.id, 'Document verification failed')}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                      >
                        Reject
                      </button>
                      <button 
                        onClick={() => handleApprove(request.id)}
                        className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="grid grid-cols-5 gap-1 p-2 max-w-md mx-auto">
          <button 
            onClick={() => navigate('/admin/dashboard')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">dashboard</span>
            <span className="text-[10px] font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => navigate('/admin/customers')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">groups</span>
            <span className="text-[10px] font-medium">Customers</span>
          </button>
          <button 
            onClick={() => navigate('/admin/kyc')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-[#137fec] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">verified</span>
            <span className="text-[10px] font-medium">KYC</span>
          </button>
          <button 
            onClick={() => navigate('/admin/brokers')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">corporate_fare</span>
            <span className="text-[10px] font-medium">Brokers</span>
          </button>
          <button 
            onClick={() => navigate('/admin/chats')}
            className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">chat</span>
            <span className="text-[10px] font-medium">Chats</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default KYC;