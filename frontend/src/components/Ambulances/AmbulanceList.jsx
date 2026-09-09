import { useState, useEffect } from 'react';
import { fetchAmbulances } from '../../api/ambulances';

const AmbulanceList = ({ refreshTrigger }) => {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAmbulances = async () => {
      try {
        const data = await fetchAmbulances();
        setAmbulances(data);
      } catch (err) {
        console.error('Failed to load ambulances', err);
      } finally {
        setLoading(false);
      }
    };
    loadAmbulances();
  }, [refreshTrigger]);

  const getStatusBadge = (status) => {
    const styles = {
      idle: 'bg-gray-100 text-gray-800',
      en_route: 'bg-blue-100 text-blue-800',
      arrived: 'bg-green-100 text-green-800'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${styles[status] || styles.idle}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (loading) return <div className="p-4">Loading ambulances...</div>;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle Number</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hospital</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {ambulances.length === 0 ? (
            <tr>
              <td colSpan="4" className="px-6 py-4 text-center text-gray-500">No ambulances registered</td>
            </tr>
          ) : (
            ambulances.map((amb) => (
              <tr key={amb.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{amb.vehicle_number}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{amb.driver_name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{amb.hospital}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(amb.status)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AmbulanceList;
