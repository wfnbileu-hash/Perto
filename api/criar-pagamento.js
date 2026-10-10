const mercadopago = require('mercadopago');

module.exports = async (req, res) => {
if (req.method !== 'POST') {
return res.status(405).json({
erro: 'Método não permitido'
});
}

try {
const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;

if (!token) {
  return res.status(500).json({
    erro: 'Mercado Pago não configurado no servidor'
  });
}

const { titulo, valor, produtoId } = req.body || {};

if (
  !titulo ||
  typeof valor !== 'number' ||
  !Number.isFinite(valor) ||
  valor <= 0 ||
  !produtoId
) {
  return res.status(400).json({
    erro: 'Dados do pagamento inválidos'
  });
}

const resposta = await fetch(
  'https://api.mercadopago.com/checkout/preferences',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: [
        {
          id: String(produtoId),
          title: String(titulo).slice(0, 200),
          quantity: 1,
          currency_id: 'BRL',
          unit_price: valor
        }
      ],
      back_urls: {
        success: process.env.PERTO_URL,
        failure: process.env.PERTO_URL,
        pending: process.env.PERTO_URL
      },
      auto_return: 'approved'
    })
  }
);

const dados = await resposta.json();

if (!resposta.ok) {
  console.error('Erro Mercado Pago:', dados);

  return res.status(502).json({
    erro: 'Não foi possível criar o pagamento'
  });
}

return res.status(200).json({
  id: dados.id,
  checkout_url: dados.init_point
});

} catch (erro) {
console.error('Erro ao criar pagamento:', erro);

return res.status(500).json({
  erro: 'Erro interno ao criar pagamento'
});

}
};
