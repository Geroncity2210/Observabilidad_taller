const express = require('express');
require('dotenv').config();

const PORT = process.env.PORT || 3001;
const app = express();


app.use(express.json());

app.get("/",(req,res)=>{

  res.send("Hola, relojes");

})

app.get("/:id",(req,res)=>{
  const {id} = req.query;


  //notificar con async al collector
  //llamar endpoint del otro servicio

  // res.json({response});

})

app.listen(PORT, ()=>{
  console.log(`Public service listening on http://localhost:${PORT}`);
})