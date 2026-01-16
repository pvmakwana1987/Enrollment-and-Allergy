
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ClassData {
  name: string;
  enrolled: number;
  capacity: number;
  waitlisted: number;
}

export const ClassBarChart: React.FC<{ data: ClassData[] }> = ({ data }) => {
  const chartData = data.map(d => ({
    ...d,
    occupancy: d.capacity > 0 ? (d.enrolled / d.capacity) * 100 : 0,
    remaining: Math.max(0, d.capacity - d.enrolled),
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis 
            dataKey="name" 
            angle={-45} 
            textAnchor="end" 
            interval={0} 
            fontSize={12} 
            height={70} 
          />
          <YAxis />
          <Tooltip 
            cursor={{ fill: '#f1f5f9' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload;
                return (
                  <div className="bg-white p-3 border rounded shadow-lg text-sm">
                    <p className="font-bold text-slate-800">{item.name}</p>
                    <p className="text-indigo-600">Enrolled: {item.enrolled} / {item.capacity}</p>
                    <p className="text-rose-500">Waitlist: {item.waitlisted}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="enrolled" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.enrolled > entry.capacity ? '#ef4444' : '#4f46e5'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
