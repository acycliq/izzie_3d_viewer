var config = function () {
    return {
            // cellData: {mediaLink: './data/cellData.tsv', size: "96503040"},
            // geneData: {mediaLink: './data/geneData.tsv', size: "136717302"},
            // cellData: {mediaLink: 'https://storage.googleapis.com/merfish_data/cellData_rgb.tsv', size: "96503040"},
            cellData: {mediaLink: './data/cellData_rgb.tsv', size: "11476992"},
            // geneData: {mediaLink: 'https://storage.googleapis.com/merfish_data/geneData.tsv', size: "136717302"},
            // cellBoundaries: {mediaLink: './cellBoundaries.tsv', size: "1306209"},
            roi: {"x0": 0, "x1": 7602, "y0": 0, "y1": 5471 },
            zoomLevels: 10,
            tiles: 'https://storage.googleapis.com/ca1-data/img/262144px/{z}/{y}/{x}.jpg',
        }
};
export default config;

