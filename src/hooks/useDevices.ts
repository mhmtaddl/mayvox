import { useState, useEffect } from 'react';

export function useDevices() {
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>(() => localStorage.getItem('selectedInput') || '');
  const [selectedOutput, setSelectedOutput] = useState<string>(() => localStorage.getItem('selectedOutput') || '');
  const [showInputSettings, setShowInputSettings] = useState(false);
  const [showOutputSettings, setShowOutputSettings] = useState(false);

  // Fetch devices and listen for device changes
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          stream.getTracks().forEach(track => track.stop());
        }).catch(err => console.warn("Mikrofon izni alınamadı, etiketler boş olabilir:", err));

        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput');
        const outputs = devices.filter(d => d.kind === 'audiooutput');

        setInputDevices(inputs);
        setOutputDevices(outputs);

        const savedInput = localStorage.getItem('selectedInput');
        const savedOutput = localStorage.getItem('selectedOutput');

        // Stale validation — her fetch'te mevcut seçili cihaz hâlâ listede mi kontrol et.
        // Cihaz çıkarılınca invalid deviceId'de takılı kalmayı önler (kulaklık fişi çekilir gibi).
        if (inputs.length > 0) {
          setSelectedInput(prev => {
            const stillValid = prev && inputs.some(d => d.deviceId === prev);
            if (stillValid) return prev;
            const savedValid = savedInput && inputs.some(d => d.deviceId === savedInput);
            return savedValid ? savedInput : inputs[0].deviceId;
          });
        }

        if (outputs.length > 0) {
          setSelectedOutput(prev => {
            const stillValid = prev && outputs.some(d => d.deviceId === prev);
            if (stillValid) return prev;
            const savedValid = savedOutput && outputs.some(d => d.deviceId === savedOutput);
            return savedValid ? savedOutput : outputs[0].deviceId;
          });
        }
      } catch (err) {
        console.error("Cihazlar listelenemedi:", err);
        const mockInputs = [
          { deviceId: 'default', label: 'Varsayılan Mikrofon', kind: 'audioinput' } as MediaDeviceInfo,
          { deviceId: 'mic1', label: 'Realtek Audio', kind: 'audioinput' } as MediaDeviceInfo,
        ];
        const mockOutputs = [
          { deviceId: 'default', label: 'Varsayılan Hoparlör', kind: 'audiooutput' } as MediaDeviceInfo,
          { deviceId: 'spk1', label: 'Kulaklık (High Definition Audio)', kind: 'audiooutput' } as MediaDeviceInfo,
        ];
        setInputDevices(mockInputs);
        setOutputDevices(mockOutputs);
        setSelectedInput(prev => prev || 'default');
        setSelectedOutput(prev => prev || 'default');
      }
    };

    fetchDevices();

    navigator.mediaDevices.addEventListener('devicechange', fetchDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', fetchDevices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist selectedInput to localStorage
  useEffect(() => {
    if (selectedInput) localStorage.setItem('selectedInput', selectedInput);
  }, [selectedInput]);

  // Persist selectedOutput to localStorage
  useEffect(() => {
    if (selectedOutput) localStorage.setItem('selectedOutput', selectedOutput);
  }, [selectedOutput]);

  return {
    inputDevices,
    outputDevices,
    selectedInput,
    setSelectedInput,
    selectedOutput,
    setSelectedOutput,
    showInputSettings,
    setShowInputSettings,
    showOutputSettings,
    setShowOutputSettings,
  };
}
