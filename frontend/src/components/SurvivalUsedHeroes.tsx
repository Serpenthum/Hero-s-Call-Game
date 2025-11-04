import React from 'react';
import '../styles/SurvivalUsedHeroes.css';

interface SurvivalUsedHeroesProps {
  usedHeroes: string[];
}

const SurvivalUsedHeroes: React.FC<SurvivalUsedHeroesProps> = ({ usedHeroes }) => {
  // Remove duplicates and sort alphabetically
  const uniqueUsedHeroes = [...new Set(usedHeroes)].sort();

  return (
    <div className="survival-used-heroes">
      <h3>Used Heroes</h3>
      <div className="used-heroes-subtitle">
        These heroes are no longer available for selection
      </div>
      
      {uniqueUsedHeroes.length === 0 ? (
        <div className="no-used-heroes">
          <p>No heroes used yet</p>
          <p className="hint">Heroes you use in battles will appear here</p>
        </div>
      ) : (
        <div className="used-heroes-list">
          {uniqueUsedHeroes.map((heroName, index) => (
            <div key={index} className="used-hero-item">
              <img 
                src={`http://localhost:3001/hero-images/${heroName}.png`}
                alt={heroName}
                className="used-hero-image"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iOCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vPC90ZXh0Pjwvc3ZnPg==';
                }}
              />
              <span className="used-hero-name">{heroName}</span>
            </div>
          ))}
        </div>
      )}
      
      {uniqueUsedHeroes.length > 0 && (
        <div className="used-heroes-count">
          {uniqueUsedHeroes.length} hero{uniqueUsedHeroes.length !== 1 ? 's' : ''} used
        </div>
      )}
    </div>
  );
};

export default SurvivalUsedHeroes;