import { useState, useEffect } from 'react';
import AmbulanceList from '../components/Ambulances/AmbulanceList';
import AmbulanceForm from '../components/Ambulances/AmbulanceForm';
import { fetchAmbulances } from '../api/ambulances';

const AmbulancesPage = () => {
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAmbulances = async () => {
    try {
      const data = await fetchAmbulances();
      setAmbulances(data);
    } catch (err) {
      console.error('Error fetching ambulances', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAmbulances();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto w-full h-full overflow-y-auto custom-scrollbar">
      <h1 className="text-2xl font-bold text-gc-dark mb-6">Ambulance Fleet</h1>
      <AmbulanceForm onSuccess={loadAmbulances} />
      {loading ? (
        <p className="text-gray-500 mt-4">Loading ambulances...</p>
      ) : (
        <AmbulanceList ambulances={ambulances} />
      )}
    </div>
  );
};

export default AmbulancesPage;
