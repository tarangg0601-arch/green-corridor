import { useState } from 'react';
import { callAmbulance } from '../../api/dispatch';

const CallAmbulanceForm = ({ onClose, onSuccess }) => {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!address.trim()) return;
    
    setLoading(true);
    setError('');
    try {
      await callAmbulance({ address: address.trim() });
      onSuccess();
    } catch (err) {
      console.error('Failed to call ambulance', err);
      setError(err.response?.data?.error || err.message || 'Failed to dispatch ambulance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 p-6 border-t-4 border-red-600">
        <h2 className="text-xl font-bold mb-1 text-red-600 flex items-center gap-2">
          🚨 Emergency Dispatch
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Automatically routes the nearest idle ambulance to the patient, then to the nearest hospital.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Location / Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Marina Beach, Chennai"
              required
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-2 text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !address}
              className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50 transition-colors"
            >
              {loading ? 'Dispatching...' : 'Dispatch Now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CallAmbulanceForm;
